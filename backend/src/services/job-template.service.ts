import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';

class JobTemplateService {
  async getTemplates(userId: string) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    return prisma.jobTemplate.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTemplate(
    userId: string,
    data: { name: string; description?: string; templateData: any }
  ) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    return prisma.jobTemplate.create({
      data: {
        companyId: company.id,
        name: data.name,
        description: data.description,
        templateData: data.templateData,
      },
    });
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    data: { name?: string; description?: string; templateData?: any }
  ) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    const template = await prisma.jobTemplate.findFirst({
      where: { id: templateId, companyId: company.id },
    });
    if (!template) throw new AppError('Template not found or access denied', 404);

    return prisma.jobTemplate.update({
      where: { id: templateId },
      data,
    });
  }

  async deleteTemplate(userId: string, templateId: string) {
    const company = await prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!company) throw new AppError('Company profile not found', 404);

    const template = await prisma.jobTemplate.findFirst({
      where: { id: templateId, companyId: company.id },
    });
    if (!template) throw new AppError('Template not found or access denied', 404);

    await prisma.jobTemplate.delete({ where: { id: templateId } });
  }
}

export const jobTemplateService = new JobTemplateService();
