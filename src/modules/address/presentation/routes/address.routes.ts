import { Router } from "express";
import { container } from "tsyringe";
import { authenticate } from "@/shared/middleware/auth.middleware.js";
import { AddressController } from "../controller/address.controller.js";

const router = Router();

const getAddressController = () => container.resolve(AddressController);

// All address routes require authentication
router.get("/addresses", authenticate, (req, res) =>
  getAddressController().getAddresses(req, res)
);

router.get("/addresses/default", authenticate, (req, res) =>
  getAddressController().getDefaultAddress(req, res)
);

router.get("/addresses/:id", authenticate, (req, res) =>
  getAddressController().getAddress(req, res)
);

router.post("/addresses", authenticate, (req, res) =>
  getAddressController().createAddress(req, res)
);

router.put("/addresses/:id", authenticate, (req, res) =>
  getAddressController().updateAddress(req, res)
);

router.put("/addresses/:id/set-default", authenticate, (req, res) =>
  getAddressController().setAsDefault(req, res)
);

router.delete("/addresses/:id", authenticate, (req, res) =>
  getAddressController().deleteAddress(req, res)
);

export default router;
