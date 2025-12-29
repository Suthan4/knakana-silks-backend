import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { WarehouseController } from "../controller/warehouse.controller.js";

const router = Router();

const getWarehouseController = () => container.resolve(WarehouseController);

// Admin routes - all warehouse operations require admin permissions
router.get(
  "/admin/warehouses",
  authenticate,
  checkPermission("warehouses", "read"),
  (req, res) => getWarehouseController().getWarehouses(req, res)
);

router.get(
  "/admin/warehouses/active",
  authenticate,
  checkPermission("warehouses", "read"),
  (req, res) => getWarehouseController().getActiveWarehouses(req, res)
);

router.get(
  "/admin/warehouses/:id",
  authenticate,
  checkPermission("warehouses", "read"),
  (req, res) => getWarehouseController().getWarehouse(req, res)
);

router.get(
  "/admin/warehouses/:id/stock",
  authenticate,
  checkPermission("warehouses", "read"),
  (req, res) => getWarehouseController().getWarehouseStock(req, res)
);

router.post(
  "/admin/warehouses",
  authenticate,
  checkPermission("warehouses", "create"),
  (req, res) => getWarehouseController().createWarehouse(req, res)
);

router.put(
  "/admin/warehouses/:id",
  authenticate,
  checkPermission("warehouses", "update"),
  (req, res) => getWarehouseController().updateWarehouse(req, res)
);

router.delete(
  "/admin/warehouses/:id",
  authenticate,
  checkPermission("warehouses", "delete"),
  (req, res) => getWarehouseController().deleteWarehouse(req, res)
);

export default router;
