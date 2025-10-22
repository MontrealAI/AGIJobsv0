-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "parentId" TEXT,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Citation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Citation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoundFinalization" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roundId" TEXT NOT NULL,
    "previousDifficulty" INTEGER NOT NULL,
    "difficultyDelta" INTEGER NOT NULL,
    "newDifficulty" INTEGER NOT NULL,
    "finalizedAt" DATETIME NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "InfluenceMetric" (
    "artifactId" TEXT NOT NULL PRIMARY KEY,
    "score" REAL NOT NULL,
    "citationCount" INTEGER NOT NULL,
    "lineageDepth" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InfluenceMetric_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventCursor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "DatasetChecksum" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Citation_fromId_toId_blockNumber_logIndex_key" ON "Citation"("fromId", "toId", "blockNumber", "logIndex");

-- CreateIndex
CREATE INDEX "Artifact_parentId_idx" ON "Artifact"("parentId");

-- CreateIndex
CREATE INDEX "Citation_fromId_idx" ON "Citation"("fromId");

-- CreateIndex
CREATE INDEX "Citation_toId_idx" ON "Citation"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundFinalization_roundId_blockNumber_logIndex_key" ON "RoundFinalization"("roundId", "blockNumber", "logIndex");
