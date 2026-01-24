-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "cardNetwork" TEXT,
ADD COLUMN     "cardType" TEXT,
ADD COLUMN     "upiId" TEXT,
ADD COLUMN     "walletName" TEXT;
