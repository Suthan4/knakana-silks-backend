# This creates ONE clean migration with your current schema
# 1. Create migration
npx prisma migrate dev --name init
# 2
npx prisma generate

# 2. For production database
npx prisma migrate deploy
# 3.
npx prisma migrate reset

# seed npx tsx prisma/seed.ts   
What happens:

Migration: Adds the new columns (artisanName, artisanAbout, artisanImage, artisanLocation) to your products table in the database
Generate: Updates your Prisma Client so TypeScript knows about the new fields

<!-- npx tsx prisma/seed.ts   -->

Add to run this in prod deployment
(official AWS) using windows powershell:
mkdir C:\certs -Force
Invoke-WebRequest `
  -Uri "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" `
  -OutFile "C:\certs\global-bundle.pem"
$env:NODE_EXTRA_CA_CERTS="C:\certs\global-bundle.pem"

npx tsx prisma/seed.ts

ssh -i kankana-api-server-key.pem ubuntu@3.111.86.16

