import { BadRequestException, Injectable } from '@nestjs/common';
import { Container, FieldType, Prisma } from '@prisma/client';
import { DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

export type ResolvedField = Prisma.CustomFieldDefinitionGetPayload<{ include: { options: true } }>;

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(workspaceId: string, path: Container[], db: DomainDb = this.prisma) {
    const ids = path.map((node) => node.id);
    const definitions = await db.customFieldDefinition.findMany({
      where: { workspaceId, ownerContainerId: { in: ids } },
      include: { options: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
    });
    const rawFields = definitions.sort(
      (a, b) =>
        ids.indexOf(a.ownerContainerId) - ids.indexOf(b.ownerContainerId) ||
        a.position.comparedTo(b.position) ||
        a.id.localeCompare(b.id),
    );
    return {
      fields: rawFields.map((field) => ({
        id: field.id,
        key: field.key,
        name: field.name,
        type: field.type,
        required: field.required,
        ownerContainerId: field.ownerContainerId,
        options: field.options.map((option) => ({
          id: option.id,
          label: option.label,
          color: option.color,
        })),
      })),
      rawFields,
    };
  }

  validate(values: Record<string, unknown>, fields: ResolvedField[]) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    for (const key of Object.keys(values))
      if (!byKey.has(key)) throw new BadRequestException(`customFields.${key}: unknown field.`);
    for (const field of fields) {
      const value = values[field.key];
      const missing =
        value === undefined ||
        value === null ||
        (field.type === FieldType.text && typeof value === 'string' && !value.trim()) ||
        (field.type === FieldType.multi_select && Array.isArray(value) && !value.length);
      if (missing) {
        if (field.required)
          throw new BadRequestException(`customFields.${field.key}: value is required.`);
        continue;
      }
      let valid = false;
      switch (field.type) {
        case FieldType.text:
          valid = typeof value === 'string';
          break;
        case FieldType.number:
          valid = typeof value === 'number' && Number.isFinite(value);
          break;
        case FieldType.checkbox:
          valid = typeof value === 'boolean';
          break;
        case FieldType.date:
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const date = new Date(`${value}T00:00:00.000Z`);
            valid = !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
          }
          break;
        case FieldType.single_select:
          valid = typeof value === 'string' && field.options.some((option) => option.id === value);
          break;
        case FieldType.multi_select:
          valid =
            Array.isArray(value) &&
            new Set(value).size === value.length &&
            value.every(
              (item) =>
                typeof item === 'string' && field.options.some((option) => option.id === item),
            );
          break;
      }
      if (!valid)
        throw new BadRequestException(`customFields.${field.key}: invalid ${field.type} value.`);
    }
  }
}
