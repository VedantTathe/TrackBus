import express from 'express';
import {
  createBus,
  getBuses,
  assignDriver,
  getRoutes,
  getRouteById,
  getActiveBuses,
  toggleBusTracking,
  updateCrowdStatus,
  updateBus,
  removeBus,
  removeDriverAssignment,
  getActiveDrivers
} from '../controllers/busController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validateCreateBus, validateAssignDriver } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Administrative Roster Routes (Admin Only clearance)
router.post('/', protect, authorize('admin'), validateCreateBus, createBus);
router.get('/', protect, authorize('admin'), getBuses);
router.put('/:id', protect, authorize('admin'), updateBus);
router.delete('/:id', protect, authorize('admin'), removeBus);
router.put('/assign-driver', protect, authorize('admin'), validateAssignDriver, assignDriver);
router.put('/remove-driver', protect, authorize('admin'), removeDriverAssignment);
router.get('/active-drivers', protect, authorize('admin'), getActiveDrivers);

// Legacy Public & Client Routes (Passenger / Driver tracking integrations)
router.get('/routes', getRoutes);
router.get('/routes/:id', getRouteById);
router.get('/active', getActiveBuses);
router.get('/live', getActiveBuses); // Live buses visualizer REST gateway
router.post('/toggle', protect, authorize('driver'), toggleBusTracking);
router.post('/crowd', protect, updateCrowdStatus);

export default router;
