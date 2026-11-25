-- Add CLOSED status for product requests after stock becomes purchasable.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
