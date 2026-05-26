import express from 'express';
import {
  predictEta,
  getRouteAnalytics,
  getBusCrowdLevel
} from '../controllers/analyticsController.js';

const router = express.Router();

// AI prediction and Smart Analytics endpoints
router.post('/predict-eta', predictEta);
router.get('/route-analytics', getRouteAnalytics);
router.get('/bus-crowd-level', getBusCrowdLevel);

export default router;
