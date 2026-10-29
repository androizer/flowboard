import { Allow } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Transport DTOs document request bodies; workflow services retain domain validation. */
export class RenameWorkspaceDto {
  @ApiProperty({ example: 'Acme' }) @Allow() name!: string;
}

export class CreateContainerDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @Allow() parentId?: string | null;
  @ApiProperty({ enum: ['space', 'folder', 'list'] }) @Allow() type!: 'space' | 'folder' | 'list';
  @ApiProperty({ example: 'Backlog' }) @Allow() name!: string;
  @ApiPropertyOptional({ enum: ['public', 'private'] }) @Allow() visibility?: 'public' | 'private';
}

export class ReorderContainersDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) @Allow() parentId!: string | null;
  @ApiProperty({ type: [String], format: 'uuid' }) @Allow() ids!: string[];
}

export class UpdateContainerDto {
  @ApiPropertyOptional({ example: 'Backlog' }) @Allow() name?: string;
  @ApiPropertyOptional({ enum: ['public', 'private'] }) @Allow() visibility?: 'public' | 'private';
}

export class StatusDefinitionDto {
  @ApiProperty({ example: 'in_progress' }) @Allow() key!: string;
  @ApiProperty({ example: 'In progress' }) @Allow() name!: string;
  @ApiProperty({ enum: ['not_started', 'active', 'done'] }) @Allow() category!: string;
  @ApiProperty({ example: '#1677ff' }) @Allow() color!: string;
}

export class PutStatusSetDto {
  @ApiProperty({ type: [StatusDefinitionDto], minItems: 3 }) @Allow() statuses!: StatusDefinitionDto[];
}

export class FieldOptionDto {
  @ApiPropertyOptional({ format: 'uuid' }) @Allow() id?: string;
  @ApiProperty({ example: 'Small' }) @Allow() label!: string;
  @ApiProperty({ example: '#52c41a' }) @Allow() color!: string;
}

export class FieldDefinitionDto {
  @ApiPropertyOptional({ example: 'effort' }) @Allow() key?: string;
  @ApiPropertyOptional({ example: 'Effort' }) @Allow() name?: string;
  @ApiPropertyOptional({ enum: ['text', 'number', 'single_select', 'multi_select', 'date', 'checkbox'] }) @Allow() type?: string;
  @ApiPropertyOptional({ type: Boolean, default: false }) @Allow() required?: boolean;
  @ApiPropertyOptional({ type: [FieldOptionDto] }) @Allow() options?: FieldOptionDto[];
}

export class CreateFieldDto {
  @ApiProperty({ example: 'effort' }) @Allow() key!: string;
  @ApiProperty({ example: 'Effort' }) @Allow() name!: string;
  @ApiProperty({ enum: ['text', 'number', 'single_select', 'multi_select', 'date', 'checkbox'] })
  @Allow() type!: string;
  @ApiPropertyOptional({ type: Boolean, default: false }) @Allow() required?: boolean;
  @ApiPropertyOptional({ type: [FieldOptionDto] }) @Allow() options?: FieldOptionDto[];
}

export class ReorderFieldsDto {
  @ApiProperty({ type: [String], format: 'uuid' }) @Allow() ids!: string[];
}

export class PutGrantDto {
  @ApiProperty({ enum: ['allow', 'deny'] }) @Allow() mode!: 'allow' | 'deny';
}

export class TaskCreateDto {
  @ApiProperty({ example: 'Fix login' }) @Allow() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @Allow() description?: string | null;
  @ApiProperty({ example: 'todo' }) @Allow() statusKey!: string;
  @ApiPropertyOptional({ enum: ['urgent', 'high', 'normal', 'low', 'none'] }) @Allow() priority?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) @Allow() dueDate?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @Allow() assigneeIds?: string[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @Allow() customFields?: Record<string, unknown>;
}

export class TaskUpdateDto {
  @ApiProperty({ minimum: 1 }) @Allow() expectedVersion!: number;
  @ApiPropertyOptional({ example: 'Fix login' }) @Allow() title?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @Allow() description?: string | null;
  @ApiPropertyOptional({ example: 'todo' }) @Allow() statusKey?: string;
  @ApiPropertyOptional({ enum: ['urgent', 'high', 'normal', 'low', 'none'] }) @Allow() priority?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) @Allow() dueDate?: string | null;
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @Allow() assigneeIds?: string[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @Allow() customFields?: Record<string, unknown>;
}

export class TaskPlacementDto {
  @ApiProperty({ minimum: 1 }) @Allow() expectedVersion!: number;
  @ApiProperty({ example: 'in_progress' }) @Allow() statusKey!: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Insert before this task; omitted means append.' }) @Allow() beforeTaskId?: string;
}

export class TaskMoveDto {
  @ApiProperty({ minimum: 1 }) @Allow() expectedVersion!: number;
  @ApiProperty({ format: 'uuid' }) @Allow() destinationListId!: string;
  @ApiPropertyOptional({ example: 'in_progress' }) @Allow() statusKey?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) @Allow() customFields?: Record<string, unknown>;
  @ApiPropertyOptional({ format: 'uuid', description: 'Insert before this task; omitted means append.' }) @Allow() beforeTaskId?: string;
}
