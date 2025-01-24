// Import necessary Pulumi modules
import * as pulumi from '@pulumi/pulumi';
import * as resources from '@pulumi/azure-native/resources';
import * as containerregistry from '@pulumi/azure-native/containerregistry';
import * as docker from '@pulumi/docker';
import * as containerinstance from '@pulumi/azure-native/containerinstance';

// Load configuration settings for the current stack
const config = new pulumi.Config();
const appPath = config.require('appPath');
let prefixName = config.require('prefixName');

// Ensure the registry name follows the required pattern (alphanumeric)
prefixName = prefixName.replace(/[^a-zA-Z0-9]/g, '');  // Remove non-alphanumeric characters

const imageName = prefixName;
const imageTag = config.require('imageTag');
const containerPort = config.requireNumber('containerPort');
const publicPort = config.requireNumber('publicPort');
const cpu = config.requireNumber('cpu');
const memory = config.requireNumber('memory');

// Create a resource group
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`);

// Create the container registry
const registry = new containerregistry.Registry(`${prefixName}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic,
  },
});

// Get the authentication credentials for the container registry
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply((creds) => {
    return {
      username: creds.username!,
      password: creds.passwords![0].value!,
    };
  });

// Define the container image for the service
const image = new docker.Image(`${prefixName}-image`, {
  imageName: pulumi.interpolate`${registry.loginServer}/${imageName}:${imageTag}`,
  build: {
    context: appPath,
    platform: 'linux/amd64',  // Target architecture for Docker image
  },
  registry: {
    server: registry.loginServer,
    username: registryCredentials.username,
    password: registryCredentials.password,
  },
});

// Create a container group in the Azure Container App service and make it publicly accessible
const containerGroup = new containerinstance.ContainerGroup(
  `${prefixName}-container-group`,
  {
    resourceGroupName: resourceGroup.name,
    osType: 'linux',
    restartPolicy: 'always',
    imageRegistryCredentials: [
      {
        server: registry.loginServer,
        username: registryCredentials.username,
        password: registryCredentials.password,
      },
    ],
    containers: [
      {
        name: imageName,
        image: image.imageName,
        ports: [
          {
            port: containerPort,
            protocol: 'tcp',
          },
        ],
        environmentVariables: [
          {
            name: 'PORT',
            value: containerPort.toString(),
          },
          {
            name: 'WEATHER_API_KEY',
            
            value: 'fbf1dfbaed7249fcb1cf3db87c99745c',  // Replace with your real API key
          },
        ],
        resources: {
          requests: {
            cpu: cpu,
            memoryInGB: memory,
          },
        },
      },
    ],
    ipAddress: {
      type: containerinstance.ContainerGroupIpAddressType.Public,
      dnsNameLabel: `${imageName}`,
      ports: [
        {
          port: publicPort,
          protocol: 'tcp',
        },
      ],
    },
  },
);

// Export the service's IP address, hostname, and fully-qualified URL
export const hostname = containerGroup.ipAddress.apply((addr) => addr!.fqdn!);
export const ip = containerGroup.ipAddress.apply((addr) => addr!.ip!);
export const url = containerGroup.ipAddress.apply(
  (addr) => `http://${addr!.fqdn!}:${containerPort}`,
);
