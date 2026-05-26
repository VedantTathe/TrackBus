/**
 * Geolocation Utilities
 * Handles distance calculations, nearby bus filtering, and route filtering logic
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 * @param {number} lat1 - User latitude
 * @param {number} lon1 - User longitude
 * @param {number} lat2 - Bus latitude
 * @param {number} lon2 - Bus longitude
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Convert distance in kilometers to display format
 * @param {number} distanceKm - Distance in km
 * @returns {string} Formatted distance
 */
export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

/**
 * Filter buses within a specified radius of user location
 * @param {Array} buses - Array of bus objects with latitude/longitude
 * @param {number} userLat - User latitude
 * @param {number} userLon - User longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @returns {Array} Filtered buses with distance information
 */
export const findNearbyBuses = (buses, userLat, userLon, radiusKm = 5) => {
  return buses
    .map((bus) => ({
      ...bus.toObject ? bus.toObject() : bus,
      distance: calculateDistance(userLat, userLon, bus.latitude, bus.longitude),
    }))
    .filter((bus) => bus.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Filter routes based on search query
 * @param {Array} routes - Array of route objects
 * @param {string} query - Search query (route name or number)
 * @returns {Array} Filtered routes
 */
export const searchRoutes = (routes, query) => {
  if (!query || query.trim() === '') return routes;
  
  const lowerQuery = query.toLowerCase().trim();
  return routes.filter((route) => {
    const routeName = route.routeName?.toLowerCase() || '';
    const routeNumber = route.routeNumber?.toLowerCase() || '';
    const startStop = route.startStop?.toLowerCase() || '';
    const endStop = route.endStop?.toLowerCase() || '';
    
    return (
      routeName.includes(lowerQuery) ||
      routeNumber.includes(lowerQuery) ||
      startStop.includes(lowerQuery) ||
      endStop.includes(lowerQuery)
    );
  });
};

/**
 * Filter buses by route
 * @param {Array} buses - Array of bus objects
 * @param {string} routeId - Route ID to filter by
 * @returns {Array} Filtered buses
 */
export const filterBusesByRoute = (buses, routeId) => {
  return buses.filter((bus) => bus.route?.toString() === routeId.toString());
};

/**
 * Get estimated arrival time (placeholder for future AI ETA calculation)
 * Currently returns a simple estimate based on distance and average speed
 * @param {number} distanceKm - Distance to bus in kilometers
 * @param {number} busSpeed - Current bus speed in km/h (optional)
 * @returns {object} ETA information
 */
export const calculateETA = (distanceKm, busSpeed = 30) => {
  const avgSpeed = busSpeed || 30; // Default average speed in km/h
  const etaMinutes = Math.round((distanceKm / avgSpeed) * 60);
  
  return {
    etaMinutes,
    etaTime: new Date(Date.now() + etaMinutes * 60000),
    status: etaMinutes <= 2 ? 'arriving' : etaMinutes <= 5 ? 'approaching' : 'incoming',
  };
};

/**
 * Format crowd level as human-readable text and emoji
 * @param {number} crowdLevel - Crowd level (1-4)
 * @returns {object} Formatted crowd info
 */
export const formatCrowdLevel = (crowdLevel) => {
  const crowdMap = {
    1: { text: 'Empty', emoji: '😊', color: 'text-green-600', bgColor: 'bg-green-100' },
    2: { text: 'Seats Available', emoji: '👤', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    3: { text: 'Standing Room', emoji: '👥', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    4: { text: 'Crowded', emoji: '👥👥', color: 'text-red-600', bgColor: 'bg-red-100' },
  };
  
  return crowdMap[crowdLevel] || crowdMap[1];
};

/**
 * Get status display info for bus
 * @param {string} status - Bus status
 * @returns {object} Status display info
 */
export const getStatusDisplay = (status) => {
  const statusMap = {
    active: { text: 'Active', color: 'text-green-600', bgColor: 'bg-green-100', icon: '🟢' },
    inactive: { text: 'Inactive', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: '⚫' },
    maintenance: { text: 'Maintenance', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: '🟡' },
  };
  
  return statusMap[status] || statusMap.inactive;
};

export default {
  calculateDistance,
  formatDistance,
  findNearbyBuses,
  searchRoutes,
  filterBusesByRoute,
  calculateETA,
  formatCrowdLevel,
  getStatusDisplay,
};
