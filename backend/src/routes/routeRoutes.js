import express from 'express';
import { getRoutes, getRouteById, addRoute, modifyRoute } from '../controllers/busController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route Directories REST endpoints
router.get('/', getRoutes);
router.get('/:id', getRouteById);

// Administrative Route Creator Binds (Admin Only)
router.post('/', protect, authorize('admin'), addRoute);
router.put('/:id', protect, authorize('admin'), modifyRoute);

export default router;
