import "reflect-metadata";
import { container } from "tsyringe";
import { IAddressRepository } from "./infrastructure/interface/Iaddressrepository.js";
import { AddressRepository } from "./infrastructure/repository/AddressRepository.js";
import { AddressService } from "./application/service/address.service.js";
import { AddressController } from "./presentation/controller/address.controller.js";


export function registerAddressModule() {
  // Repositories
  container.register<IAddressRepository>("IAddressRepository", {
    useClass: AddressRepository,
  });

  // Services
  container.registerSingleton(AddressService);

  // Controllers
  container.registerSingleton(AddressController);

  console.log("✅ Address module registered");
}
