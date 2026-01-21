-- DropIndex
DROP INDEX "cart_items_cartId_productId_variantId_key";

-- CreateIndex
CREATE INDEX "cart_items_cartId_productId_idx" ON "cart_items"("cartId", "productId");
