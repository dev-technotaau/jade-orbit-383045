-- Multi-seat (CV Enterprise feature.multi_seat) — employer team members.

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'RECRUITER');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "EmployerTeamMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "invitedEmail" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'RECRUITER',
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EmployerTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployerTeamMember_inviteToken_key" ON "EmployerTeamMember"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerTeamMember_companyId_invitedEmail_key" ON "EmployerTeamMember"("companyId", "invitedEmail");

-- CreateIndex
CREATE INDEX "EmployerTeamMember_companyId_idx" ON "EmployerTeamMember"("companyId");

-- CreateIndex
CREATE INDEX "EmployerTeamMember_userId_idx" ON "EmployerTeamMember"("userId");

-- CreateIndex
CREATE INDEX "EmployerTeamMember_inviteToken_idx" ON "EmployerTeamMember"("inviteToken");

-- AddForeignKey
ALTER TABLE "EmployerTeamMember" ADD CONSTRAINT "EmployerTeamMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerTeamMember" ADD CONSTRAINT "EmployerTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerTeamMember" ADD CONSTRAINT "EmployerTeamMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
