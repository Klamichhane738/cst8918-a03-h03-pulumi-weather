import { redis } from '../data-access/redis-connection'  // Import your redis connection

const API_KEY = process.env.WEATHER_API_KEY
const TEN_MINUTES = 1000 * 60 * 10 // in milliseconds

// Use Redis for caching instead of in-memory cache
async function getCacheEntry(key: string) {
  const cacheEntry = await redis.get(key)  // Fetch data from Redis cache
  if (cacheEntry) {
    return JSON.parse(cacheEntry)  // Parse it as JSON if it's found
  }
  return null
}

async function setCacheEntry(key: string, data: unknown) {
  await redis.set(key, JSON.stringify(data), { PX: TEN_MINUTES })  // Store data in Redis and set expiry time
}

// In-memory cache check (no longer needed since we are using Redis)
function isDataStale(lastFetch: number) {
  return Date.now() - lastFetch > TEN_MINUTES
}

interface FetchWeatherDataParams {
  lat: number
  lon: number
  units: string
}

export async function fetchWeatherData({
  lat,
  lon,
  units,
}: FetchWeatherDataParams) {
  const baseURL = 'https://api.openweathermap.org/data/2.5/weather'
  const queryString = `lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`

  const cacheEntry = await getCacheEntry(queryString)  // Check if the data is cached in Redis
  if (cacheEntry) {
    return cacheEntry
  }

  // If not found in cache, fetch from the OpenWeather API
  const response = await fetch(`${baseURL}?${queryString}`)
  const data = await response.json()

  // Store the fresh data in Redis for future use
  await setCacheEntry(queryString, data)

  return data
}

export async function getGeoCoordsForPostalCode(
  postalCode: string,
  countryCode: string,
) {
  const url = `http://api.openweathermap.org/geo/1.0/zip?zip=${postalCode},${countryCode}&appid=${API_KEY}`
  const response = await fetch(url)
  const data = await response.json()
  return data
}
