export function detectTvDevice(userAgent = '') {
  return /\b(smart-tv|smarttv|appletv|googletv|hbbtv|netcast|webos|tizen|viera|bravia|chromecast|roku)\b/i.test(userAgent)
}
