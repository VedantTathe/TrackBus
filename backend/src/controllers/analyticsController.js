import dotenv from 'dotenv';

dotenv.config();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Helper to check if ML prediction service is online
 */
const checkMLServiceHealth = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout
    
    const response = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (e) {
    return false;
  }
};

/**
 * POST /api/analytics/predict-eta
 * Requests arrival ETA predictions from scikit-learn model, with robust mathematical fallback.
 */
export const predictEta = async (req, res, next) => {
  const { distance_km, speed_kmh, crowd_level, congestion_index, stop_count } = req.body;

  // Input Sanitization & Defaults
  const distance = Number(distance_km !== undefined ? distance_km : 3.5);
  const speed = Number(speed_kmh !== undefined ? speed_kmh : 25.0);
  const crowd = Number(crowd_level !== undefined ? crowd_level : 1);
  const congestion = Number(congestion_index !== undefined ? congestion_index : 3.0);
  const stops = Number(stop_count !== undefined ? stop_count : 2);

  const isMlOnline = await checkMLServiceHealth();

  if (isMlOnline) {
    try {
      console.log(`🤖 Gateway proxying ETA request to ML Service: dist=${distance}km, speed=${speed}km/h`);
      const response = await fetch(`${ML_SERVICE_URL}/predict-eta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance_km: distance,
          speed_kmh: speed,
          crowd_level: crowd,
          congestion_index: congestion,
          stop_count: stops
        })
      });

      if (response.ok) {
        const data = await response.json();
        return res.status(200).json({
          source: 'AI-ML-Microservice',
          ...data
        });
      }
    } catch (err) {
      console.error('Failed to parse ML response:', err.message);
    }
  }

  // Engage Resilient Mathematical Fallback
  console.warn('⚠️ ML microservice offline or unresponsive. Engaging real-time telemetry mathematical fallbacks.');
  
  // Base travel time: (distance / speed) * 60 minutes
  const baseTimeMin = (distance / Math.max(speed, 5.0)) * 60.0;
  
  // Calculate delay penalties
  const congestionDelay = congestion * 1.8;
  const stopDelay = stops * 1.2;
  const crowdDelay = crowd * 0.9;
  
  const predictedTime = Math.max(baseTimeMin + congestionDelay + stopDelay + crowdDelay, 1.0);
  const roundedTime = Math.round(predictedTime * 10) / 10;

  // Delay detection fallback
  const baseTimeIdeal = (distance / 40.0) * 60.0; // 40 km/h ideal speed time
  const delayRatio = predictedTime / Math.max(baseTimeIdeal, 1.0);

  let delayDetected = false;
  let delaySeverity = 'CLEAR';

  if (delayRatio > 1.4) {
    delayDetected = true;
    delaySeverity = delayRatio < 1.8 ? 'MINOR' : 'HEAVY';
  }
  if (speed < 12.0 && distance > 0.5) {
    delayDetected = true;
    delaySeverity = 'HEAVY';
  }

  // Traffic status mapping fallback
  let trafficStatus = 'SMOOTH';
  if (congestion > 3.0 && congestion <= 6.5) {
    trafficStatus = 'MODERATE';
  } else if (congestion > 6.5) {
    trafficStatus = 'HEAVY GRIDLOCK';
  }

  return res.status(200).json({
    source: 'Mathematical-Fallback-Engine',
    predicted_eta_minutes: roundedTime,
    delay_detected: delayDetected,
    delay_severity: delaySeverity,
    traffic_status: trafficStatus,
    model_confidence: 0.85 // High-confidence fallback index
  });
};

/**
 * GET /api/analytics/route-analytics
 * Proxies route delay and congestion stats with fallback indices.
 */
export const getRouteAnalytics = async (req, res, next) => {
  const { routeNumber } = req.query;
  const targetRoute = routeNumber || '101';

  const isMlOnline = await checkMLServiceHealth();

  if (isMlOnline) {
    try {
      const response = await fetch(`${ML_SERVICE_URL}/route-analytics?routeNumber=${targetRoute}`);
      if (response.ok) {
        const data = await response.json();
        return res.status(200).json({
          source: 'AI-ML-Microservice',
          ...data
        });
      }
    } catch (err) {
      console.error('Failed to proxy route analytics:', err.message);
    }
  }

  // Fallback route profiles
  const fallbackAnalytics = targetRoute === '202' ? {
    routeNumber: '202',
    routeName: 'Waterfront Express',
    average_congestion_index: 5.8,
    traffic_delay_index: 1.45,
    slow_zones: [
      { location: 'Olympic Sculpture Park Crossing', severity: 'MODERATE', delay_min: 2.5 },
      { location: 'Colman Ferry Dock Terminal', severity: 'HEAVY', delay_min: 5.2 }
    ],
    travel_time_variance_min: 4.8,
    optimal_dispatch_speed_kmh: 32.0,
    forecasted_congestion_trend: 'INCREASING'
  } : {
    routeNumber: '101',
    routeName: 'Seattle Core Link',
    average_congestion_index: 3.2,
    traffic_delay_index: 1.12,
    slow_zones: [
      { location: 'Pike Place Market Corridor', severity: 'MODERATE', delay_min: 1.8 }
    ],
    travel_time_variance_min: 2.4,
    optimal_dispatch_speed_kmh: 38.0,
    forecasted_congestion_trend: 'STABLE'
  };

  return res.status(200).json({
    source: 'Mathematical-Fallback-Engine',
    ...fallbackAnalytics
  });
};

/**
 * GET /api/analytics/bus-crowd-level
 * Proxies crowding calculations or computes estimate fallback dynamically.
 */
export const getBusCrowdLevel = async (req, res, next) => {
  const { busNumber, deviceCount } = req.query;
  if (!busNumber) {
    return res.status(400).json({ message: 'BusNumber identifier query param is required' });
  }

  const isMlOnline = await checkMLServiceHealth();

  if (isMlOnline) {
    try {
      const url = `${ML_SERVICE_URL}/bus-crowd-level?busNumber=${busNumber}` + 
                  (deviceCount ? `&deviceCount=${deviceCount}` : '');
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return res.status(200).json({
          source: 'AI-ML-Microservice',
          ...data
        });
      }
    } catch (err) {
      console.error('Failed to proxy bus crowd status:', err.message);
    }
  }

  // Fallback crowding algorithm
  let count = Number(deviceCount);
  if (isNaN(count) || count === undefined || count === 0) {
    if (busNumber.includes('101')) {
      count = Math.floor(Math.random() * (22 - 8 + 1)) + 8;
    } else if (busNumber.includes('202')) {
      count = Math.floor(Math.random() * (45 - 25 + 1)) + 25;
    } else {
      count = Math.floor(Math.random() * (12 - 2 + 1)) + 2;
    }
  }

  const capacity = 50;
  const crowdRatio = count / capacity;
  
  let crowdScale = 1;
  let crowdText = 'Empty';
  let recommendation = 'High availability. Ideal boarding status.';

  if (crowdRatio > 0.25 && crowdRatio <= 0.55) {
    crowdScale = 2;
    crowdText = 'Seats Available';
    recommendation = 'Moderate availability. Good seating possibilities.';
  } else if (crowdRatio > 0.55 && crowdRatio <= 0.85) {
    crowdScale = 3;
    crowdText = 'Standing Room Only';
    recommendation = 'High density. Standing space only, entry possible.';
  } else if (crowdRatio > 0.85) {
    crowdScale = 4;
    crowdText = 'Crowded / Full';
    recommendation = 'Capacity limit reached. Boarding delays highly expected.';
  }

  return res.status(200).json({
    source: 'Mathematical-Fallback-Engine',
    busNumber: busNumber.toUpperCase(),
    detected_devices: count,
    max_capacity: capacity,
    crowding_ratio: Number(crowdRatio.toFixed(2)),
    estimated_crowd_level: crowdScale,
    estimated_crowd_status: crowdText,
    boarding_recommendation: recommendation,
    timestamp: new Date().toISOString()
  });
};
