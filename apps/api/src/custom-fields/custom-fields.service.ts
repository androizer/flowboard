import { BadRequestException, Injectable } from '@nestjs/common';
import { Container, FieldType, Prisma } from '@prisma/client';
import { DomainDb } from '../hierarchy/hierarchy.service';
import { PrismaService } from '../persistence/prisma.service';

export type ResolvedField = Prisma.CustomFieldDefinitionGetPayload<{ include: { options: true } }>;

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  isAnswered(type: FieldType, value: unknown) {
    return !(
      value === undefined ||
      value === null ||
      (type === FieldType.text && typeof value === 'string' && !value.trim()) ||
      (type === FieldType.multi_select && Array.isArray(value) && !value.length)
    );
  }

  async local(
    workspaceId: string,
    ownerContainerId: string,
    offset: number,
    limit: number,
    db: DomainDb = this.prisma,
  ) {
    const where = { workspaceId, ownerContainerId };
    const [total, items] = await Promise.all([
      db.customFieldDefinition.count({ where }),
      db.customFieldDefinition.findMany({
        where,
        include: { options: { orderBy: { position: 'asc' } } },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
    ]);
    return { items, page: { offset, limit, total, hasMore: offset + limit < total } };
  }

  async get(workspaceId: string, id: string, db: DomainDb) {
    return db.customFieldDefinition.findFirst({
      where: { workspaceId, id },
      include: { options: { orderBy: { position: 'asc' } } },
    });
  }

  async findByKey(workspaceId: string, key: string, db: DomainDb) {
    return db.customFieldDefinition.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
  }

  candidate(value: unknown, previous?: ResolvedField) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid field definition.');
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).some((key) => !['key', 'name', 'type', 'required', 'options'].includes(key))
    )
      throw new BadRequestException('Unknown field definition property.');
    if (Object.values(row).some((item) => item === null))
      throw new BadRequestException('Field definition properties cannot be null.');
    const key = row.key ?? previous?.key;
    const name = row.name ?? previous?.name;
    const type = row.type ?? previous?.type;
    const required = row.required ?? previous?.required ?? false;
    if (
      typeof key !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(key) ||
      (previous && key !== previous.key) ||
      typeof name !== 'string' ||
      !name.trim() ||
      !Object.values(FieldType).includes(type as FieldType) ||
      typeof required !== 'boolean'
    )
      throw new BadRequestException('Invalid field key, name, type, or required flag.');
    const optionsValue =
      row.options ??
      previous?.options.map((option) => ({
        id: option.id,
        label: option.label,
        color: option.color,
      }));
    if (!Array.isArray(optionsValue)) throw new BadRequestException('options must be an array.');
    const options = optionsValue.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new BadRequestException(`options.${index}: invalid option.`);
      const option = item as Record<string, unknown>;
      if (
        Object.keys(option).some((property) => !['id', 'label', 'color'].includes(property)) ||
        (option.id !== undefined &&
          (typeof option.id !== 'string' ||
            !previous?.options.some((old) => old.id === option.id))) ||
        typeof option.label !== 'string' ||
        !option.label.trim() ||
        typeof option.color !== 'string' ||
        !option.color.trim()
      )
        throw new BadRequestException(`options.${index}: invalid option.`);
      return {
        id: option.id as string | undefined,
        label: option.label.trim(),
        color: option.color,
        position: index + 1,
      };
    });
    if (
      new Set(options.map((option) => option.id).filter(Boolean)).size !==
      options.filter((option) => option.id).length
    )
      throw new BadRequestException('Option IDs must be unique.');
    if ((type === FieldType.single_select || type === FieldType.multi_select) && !options.length)
      throw new BadRequestException('Select fields need at least one option.');
    if (type !== FieldType.single_select && type !== FieldType.multi_select && options.length)
      throw new BadRequestException('Only select fields may have options.');
    return { key, name: name.trim(), type: type as FieldType, required, options };
  }

  async create(
    workspaceId: string,
    ownerContainerId: string,
    candidate: ReturnType<CustomFieldsService['candidate']>,
    db: DomainDb,
  ) {
    const last = await db.customFieldDefinition.findFirst({
      where: { workspaceId, ownerContainerId },
      orderBy: { position: 'desc' },
    });
    return db.customFieldDefinition.create({
      data: {
        workspaceId,
        ownerContainerId,
        key: candidate.key,
        name: candidate.name,
        type: candidate.type,
        required: candidate.required,
        position: (last?.position.toNumber() ?? 0) + 1,
        options: {
          create: candidate.options.map((option) => ({
            label: option.label,
            color: option.color,
            position: option.position,
          })),
        },
      },
      include: { options: true },
    });
  }

  async update(id: string, candidate: ReturnType<CustomFieldsService['candidate']>, db: DomainDb) {
    const retained = candidate.options
      .map((option) => option.id)
      .filter((id): id is string => Boolean(id));
    await db.customFieldOption.deleteMany({
      where: { fieldDefinitionId: id, id: { notIn: retained } },
    });
    for (const option of candidate.options) {
      if (option.id)
        await db.customFieldOption.update({
          where: { id: option.id },
          data: { label: option.label, color: option.color, position: option.position },
        });
      else
        await db.customFieldOption.create({
          data: {
            fieldDefinitionId: id,
            label: option.label,
            color: option.color,
            position: option.position,
          },
        });
    }
    return db.customFieldDefinition.update({
      where: { id },
      data: { name: candidate.name, type: candidate.type, required: candidate.required },
      include: { options: true },
    });
  }

  async delete(id: string, db: DomainDb) {
    await db.customFieldDefinition.delete({ where: { id } });
  }

  async reorder(workspaceId: string, ownerContainerId: string, ids: string[], db: DomainDb) {
    const rows = await db.customFieldDefinition.findMany({
      where: { workspaceId, ownerContainerId },
    });
    if (
      rows.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      rows.some((row) => !ids.includes(row.id))
    )
      throw new BadRequestException('Supply every local field exactly once.');
    for (let index = 0; index < ids.length; index++)
      await db.customFieldDefinition.update({
        where: { id: ids[index] },
        data: { position: index + 1 },
      });
  }

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
      const missing = !this.isAnswered(field.type, value);
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
