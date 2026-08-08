-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ResourceLockMode" AS ENUM ('VIEWING', 'EDITING');

-- CreateTable
CREATE TABLE "AdminPermissionGrant" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT 'blue',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',

    CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRoleAssignment" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActivityLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "permissionKey" TEXT,
    "domain" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceLock" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "mode" "ResourceLockMode" NOT NULL DEFAULT 'VIEWING',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminPermissionGrant_adminId_idx" ON "AdminPermissionGrant"("adminId");

-- CreateIndex
CREATE INDEX "AdminPermissionGrant_permissionKey_idx" ON "AdminPermissionGrant"("permissionKey");

-- CreateIndex
CREATE INDEX "AdminPermissionGrant_expiresAt_idx" ON "AdminPermissionGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPermissionGrant_adminId_permissionKey_key" ON "AdminPermissionGrant"("adminId", "permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_name_key" ON "AdminRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_slug_key" ON "AdminRole"("slug");

-- CreateIndex
CREATE INDEX "AdminRole_slug_idx" ON "AdminRole"("slug");

-- CreateIndex
CREATE INDEX "AdminRolePermission_roleId_idx" ON "AdminRolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRolePermission_roleId_permissionKey_key" ON "AdminRolePermission"("roleId", "permissionKey");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_adminId_idx" ON "AdminRoleAssignment"("adminId");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_roleId_idx" ON "AdminRoleAssignment"("roleId");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_expiresAt_idx" ON "AdminRoleAssignment"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRoleAssignment_roleId_adminId_key" ON "AdminRoleAssignment"("roleId", "adminId");

-- CreateIndex
CREATE INDEX "AdminActivityLog_adminId_createdAt_idx" ON "AdminActivityLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActivityLog_createdAt_idx" ON "AdminActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminActivityLog_domain_createdAt_idx" ON "AdminActivityLog"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActivityLog_entity_entityId_idx" ON "AdminActivityLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "ResourceLock_resourceType_resourceId_expiresAt_idx" ON "ResourceLock"("resourceType", "resourceId", "expiresAt");

-- CreateIndex
CREATE INDEX "ResourceLock_adminId_idx" ON "ResourceLock"("adminId");

-- CreateIndex
CREATE INDEX "ResourceLock_expiresAt_idx" ON "ResourceLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceLock_resourceType_resourceId_adminId_key" ON "ResourceLock"("resourceType", "resourceId", "adminId");

-- AddForeignKey
ALTER TABLE "AdminPermissionGrant" ADD CONSTRAINT "AdminPermissionGrant_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPermissionGrant" ADD CONSTRAINT "AdminPermissionGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRoleAssignment" ADD CONSTRAINT "AdminRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRoleAssignment" ADD CONSTRAINT "AdminRoleAssignment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActivityLog" ADD CONSTRAINT "AdminActivityLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLock" ADD CONSTRAINT "ResourceLock_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

