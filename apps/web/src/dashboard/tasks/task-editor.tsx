import {
  Alert,
  Button,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from 'antd';
import { useState } from 'react';
import type { BoardResponse, FieldDefinition, TaskProjection } from '@flowboard/contracts';

type EditorValues = {
  title: string;
  description?: string;
  statusKey: string;
  priority: TaskProjection['priority'];
  dueDate?: string;
  assigneeIds?: string[];
  customFields?: Record<string, unknown>;
};

function fieldInput(field: FieldDefinition) {
  switch (field.type) {
    case 'text':
      return <Input />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} />;
    case 'single_select':
      return (
        <Select
          options={field.options.map((option) => ({ value: option.id, label: option.label }))}
          allowClear
        />
      );
    case 'multi_select':
      return (
        <Select
          mode="multiple"
          options={field.options.map((option) => ({ value: option.id, label: option.label }))}
        />
      );
    case 'date':
      return <Input type="date" />;
    case 'checkbox':
      return <Checkbox>Yes</Checkbox>;
  }
}

export function TaskEditor({
  board,
  task,
  presentation,
  members,
  onClose,
  onSave,
  onMove,
}: {
  board: BoardResponse;
  task: TaskProjection | null;
  presentation: 'modal' | 'drawer';
  members: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onMove?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const initialValues: EditorValues = {
    title: task?.title ?? '',
    description: task?.description ?? '',
    statusKey: task?.statusKey ?? board.statuses[0]?.key,
    priority: task?.priority ?? 'none',
    dueDate: task?.dueDate?.slice(0, 16),
    assigneeIds: task?.assignees.map((item) => item.id) ?? [],
    customFields: {
      ...Object.fromEntries(
        board.fields
          .filter((field) => field.type === 'checkbox' && field.required)
          .map((field) => [field.key, false]),
      ),
      ...(task?.customFields ?? {}),
    },
  };

  async function submit(values: EditorValues) {
    setSaving(true);
    setError(undefined);
    try {
      const dueDate = values.dueDate ? new Date(values.dueDate).toISOString() : null;
      const customFields = Object.fromEntries(
        board.fields.map((field) => [field.key, values.customFields?.[field.key] ?? null]),
      );
      await onSave({
        title: values.title,
        description: values.description || null,
        statusKey: values.statusKey,
        priority: values.priority,
        dueDate,
        assigneeIds: values.assigneeIds ?? [],
        customFields,
        ...(task ? { expectedVersion: task.version } : {}),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <Form
      layout="vertical"
      initialValues={initialValues}
      onFinish={(values: EditorValues) => void submit(values)}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form.Item
        label="Title"
        name="title"
        rules={[{ required: true, whitespace: true, max: 500 }]}
      >
        <Input autoFocus />
      </Form.Item>
      <Form.Item label="Description" name="description">
        <Input.TextArea rows={presentation === 'modal' ? 6 : 4} />
      </Form.Item>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Status" name="statusKey" rules={[{ required: true }]}>
            <Select
              options={board.statuses.map((status) => ({ value: status.key, label: status.name }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Priority" name="priority">
            <Select
              options={['urgent', 'high', 'normal', 'low', 'none'].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Due date and time" name="dueDate">
            <Input type="datetime-local" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Assignees" name="assigneeIds">
            <Select
              mode="multiple"
              options={members.map((member) => ({ value: member.id, label: member.name }))}
            />
          </Form.Item>
        </Col>
      </Row>
      {board.fields.length > 0 && <div className="task-editor-section">Custom fields</div>}
      <Row gutter={16}>
        {board.fields.map((field) => (
          <Col xs={24} sm={field.type === 'text' ? 24 : 12} key={field.id}>
            <Form.Item
              label={field.name}
              name={['customFields', field.key]}
              valuePropName={field.type === 'checkbox' ? 'checked' : 'value'}
              rules={[
                {
                  required: field.required && field.type !== 'checkbox',
                  message: `${field.name} is required.`,
                },
              ]}
            >
              {fieldInput(field)}
            </Form.Item>
          </Col>
        ))}
      </Row>
      <div className="task-editor-actions">
        {task && onMove && <Button onClick={onMove}>Move to another list</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {task ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </Form>
  );

  const title = task ? 'Task details' : 'Create task';
  return presentation === 'modal' ? (
    <Modal open onCancel={onClose} title={title} footer={null} width={820} destroyOnClose>
      {content}
    </Modal>
  ) : (
    <Drawer open onClose={onClose} title={title} width={560} destroyOnClose>
      {content}
    </Drawer>
  );
}
