import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import type {
  Container,
  FieldDefinition,
  StatusDefinition,
  TaskProjection,
} from '@flowboard/contracts';
import { getResolvedConfig, moveTask } from '../identity/session-client';

export function TaskMove({
  accessToken,
  task,
  lists,
  sourceFields,
  onClose,
  onMoved,
}: {
  accessToken: string;
  task: TaskProjection;
  lists: Container[];
  sourceFields: FieldDefinition[];
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const [destinationId, setDestinationId] = useState<string>();
  const [statuses, setStatuses] = useState<StatusDefinition[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [statusKey, setStatusKey] = useState<string>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [clears, setClears] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!destinationId) return;
    let active = true;
    setError(undefined);
    setStatuses([]);
    setFields([]);
    void getResolvedConfig(accessToken, destinationId)
      .then((config) => {
        if (!active) return;
        setStatuses(config.statuses);
        setFields(config.fields);
        setStatusKey(
          config.statuses.some((status) => status.key === task.statusKey)
            ? task.statusKey
            : config.statuses[0]?.key,
        );
        setValues(
          Object.fromEntries(
            config.fields
              .filter((field) => task.customFields[field.key] !== undefined)
              .map((field) => [field.key, task.customFields[field.key]]),
          ),
        );
        setClears([]);
      })
      .catch(
        (cause) =>
          active &&
          setError(cause instanceof Error ? cause.message : 'Unable to load destination.'),
      );
    return () => {
      active = false;
    };
  }, [accessToken, destinationId, task]);
  const sourceOnly = sourceFields.filter(
    (field) =>
      task.customFields[field.key] !== undefined &&
      !fields.some((target) => target.key === field.key),
  );
  async function submit() {
    if (!destinationId || !statusKey) return;
    setBusy(true);
    setError(undefined);
    try {
      const customFields = { ...values, ...Object.fromEntries(clears.map((key) => [key, null])) };
      await moveTask(accessToken, task.id, {
        expectedVersion: task.version,
        destinationListId: destinationId,
        statusKey,
        customFields,
      });
      await onMoved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to move task.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`Move ${task.title}`}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            description="The task and your corrections were not changed."
          />
        )}
        <Typography.Text>Destination list</Typography.Text>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Select a list"
          value={destinationId}
          options={lists
            .filter((list) => list.type === 'list' && list.id !== task.primaryListId)
            .map((list) => ({ value: list.id, label: list.name }))}
          onChange={setDestinationId}
          style={{ width: '100%' }}
        />
        {destinationId && statuses.length > 0 && (
          <>
            <Typography.Text>Status in destination</Typography.Text>
            <Select
              value={statusKey}
              options={statuses.map((status) => ({ value: status.key, label: status.name }))}
              onChange={setStatusKey}
              style={{ width: '100%' }}
            />
          </>
        )}
        {fields.map((field) => (
          <Form.Item
            key={field.id}
            label={`${field.name}${field.required ? ' (required)' : ''}`}
            style={{ marginBottom: 4 }}
          >
            <div>
              {field.type === 'checkbox' ? (
                <Checkbox
                  checked={values[field.key] === true}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.checked })}
                >
                  Yes
                </Checkbox>
              ) : field.type === 'single_select' || field.type === 'multi_select' ? (
                <Select
                  mode={field.type === 'multi_select' ? 'multiple' : undefined}
                  allowClear
                  value={values[field.key] as string | string[] | undefined}
                  options={field.options.map((option) => ({
                    value: option.id,
                    label: option.label,
                  }))}
                  onChange={(value) => setValues({ ...values, [field.key]: value })}
                  style={{ width: '100%' }}
                />
              ) : field.type === 'number' ? (
                <InputNumber
                  value={values[field.key] as number | undefined}
                  onChange={(value) => setValues({ ...values, [field.key]: value })}
                  style={{ width: '100%' }}
                />
              ) : (
                <Input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={String(values[field.key] ?? '')}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </div>
          </Form.Item>
        ))}
        {sourceOnly.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message="Source-only answers need explicit clearing"
            description={sourceOnly.map((field) => field.name).join(', ')}
          />
        )}
        {sourceOnly.map((field) => (
          <Checkbox
            key={field.key}
            checked={clears.includes(field.key)}
            onChange={(event) =>
              setClears((old) =>
                event.target.checked ? [...old, field.key] : old.filter((key) => key !== field.key),
              )
            }
          >
            Clear {field.name} from this task
          </Checkbox>
        ))}
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!destinationId || !statusKey || clears.length !== sourceOnly.length}
            onClick={() => void submit()}
          >
            Move task
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}
