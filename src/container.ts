// import { PrismaClient } from '@prisma/client';
// import { prisma } from './infrastructure/database/prisma';
// import { cacheService } from './infrastructure/redis/redis.client';
// import { emailService } from './infrastructure/email/nodemailer.service';
// import { razorpayService } from './infrastructure/payment/razorpay.service';
// import { shiprocketService } from './infrastructure/shipment/shiprocket.service';
// import { fileStorageService } from './infrastructure/file-storage/multer.config';
// import { logger } from './infrastructure/logger/winston.logger';

// export class Container {
//   private static instance: Container;

//   public readonly prisma: PrismaClient;
//   public readonly cache: typeof cacheService;
//   public readonly email: typeof emailService;
//   public readonly payment: typeof razorpayService;
//   public readonly shipment: typeof shiprocketService;
//   public readonly fileStorage: typeof fileStorageService;
//   public readonly logger: typeof logger;

//   private constructor() {
//     this.prisma = prisma;
//     this.cache = cacheService;
//     this.email = emailService;
//     this.payment = razorpayService;
//     this.shipment = shiprocketService;
//     this.fileStorage = fileStorageService;
//     this.logger = logger;
//   }

//   public static getInstance(): Container {
//     if (!Container.instance) {
//       Container.instance = new Container();
//     }
//     return Container.instance;
//   }
// }

// export const container = Container.getInstance();
