-- CreateTable
CREATE TABLE "GoogleOAuthToken" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleOAuthToken_userEmail_key" ON "GoogleOAuthToken"("userEmail");
