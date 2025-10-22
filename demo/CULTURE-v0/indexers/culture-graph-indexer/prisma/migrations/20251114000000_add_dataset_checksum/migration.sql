-- CreateTable
CREATE TABLE "DatasetChecksum" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Artifact_parentId_idx" ON "Artifact"("parentId");

-- CreateIndex
CREATE INDEX "Citation_fromId_idx" ON "Citation"("fromId");

-- CreateIndex
CREATE INDEX "Citation_toId_idx" ON "Citation"("toId");
