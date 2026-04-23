ALTER TABLE "Brand" ADD COLUMN "foundedYear" INTEGER;
ALTER TABLE "Brand" ADD COLUMN "headquartersAddress" TEXT;
ALTER TABLE "Brand" ADD COLUMN "companyType" TEXT;
ALTER TABLE "Brand" ADD COLUMN "businessSignals" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Brand" ADD COLUMN "genderFocus" TEXT;
ALTER TABLE "Brand" ADD COLUMN "productType" TEXT;
