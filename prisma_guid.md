# 1. Create migration
npx prisma migrate dev --name add_artisan_details_to_products

# 2. For production database
npx prisma migrate deploy

What happens:

Migration: Adds the new columns (artisanName, artisanAbout, artisanImage, artisanLocation) to your products table in the database
Generate: Updates your Prisma Client so TypeScript knows about the new fields