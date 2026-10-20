import {
  PrismaClient,
  ContainerType,
  FieldType,
  GrantMode,
  MembershipRole,
  Priority,
  StatusCategory,
  Visibility,
} from "@prisma/client";
import argon2 from "argon2";
const prisma = new PrismaClient();
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const workspace = id(1);
const users = { alice: id(11), bob: id(12), carol: id(13) };
const containers = {
  engineering: id(21),
  q2: id(22),
  backlog: id(23),
  delivery: id(24),
  security: id(25),
  product: id(26),
  strategy: id(27),
  roadmap: id(28),
};
async function main() {
  if (process.env.FLOWBOARD_DEMO_MODE !== "true")
    throw new Error("Demo seed is disabled outside local demo mode.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS seed_markers (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = await tx.$queryRaw<
      Array<{ version: string }>
    >`SELECT version FROM seed_markers WHERE version = 'day-1-v1'`;
    if (applied.length) return;
    await tx.workspace.create({ data: { id: workspace, name: "Flowboard" } });
    const password = process.env.SEED_PASSWORD ?? "FlowboardDemo!2026";
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    for (const [key, displayName] of [
      ["alice", "Alice"],
      ["bob", "Bob"],
      ["carol", "Carol"],
    ] as const) {
      const userId = users[key];
      await tx.user.create({
        data: {
          id: userId,
          displayName,
          identities: {
            create: {
              id: id(100 + Object.keys(users).indexOf(key)),
              issuer: "urn:flowboard:local",
              subject: userId,
            },
          },
          credential: {
            create: { loginIdentifier: `${key}@flowboard.com`, passwordHash },
          },
          memberships: {
            create: {
              workspaceId: workspace,
              role:
                key === "alice" ? MembershipRole.admin : MembershipRole.member,
            },
          },
        },
      });
    }
    const createContainer = (
      key: keyof typeof containers,
      type: ContainerType,
      name: string,
      parentContainerId: string | null,
      position: number,
      visibility: Visibility = Visibility.public,
    ) =>
      tx.container.create({
        data: {
          id: containers[key],
          workspaceId: workspace,
          type,
          name,
          parentContainerId,
          position,
          visibility,
        },
      });
    await createContainer(
      "engineering",
      ContainerType.space,
      "Engineering",
      null,
      1,
    );
    await createContainer(
      "q2",
      ContainerType.folder,
      "Q2 Launch",
      containers.engineering,
      1,
    );
    await createContainer(
      "backlog",
      ContainerType.list,
      "Backlog",
      containers.q2,
      1,
    );
    await createContainer(
      "delivery",
      ContainerType.list,
      "Delivery",
      containers.q2,
      2,
    );
    await createContainer(
      "security",
      ContainerType.list,
      "Security",
      containers.q2,
      3,
      Visibility.private,
    );
    await createContainer(
      "product",
      ContainerType.space,
      "Product",
      null,
      2,
      Visibility.private,
    );
    await createContainer(
      "strategy",
      ContainerType.folder,
      "Strategy",
      containers.product,
      1,
      Visibility.private,
    );
    await createContainer(
      "roadmap",
      ContainerType.list,
      "Roadmap",
      containers.strategy,
      1,
      Visibility.private,
    );
    await tx.containerGrant.createMany({
      data: [
        {
          id: id(40),
          workspaceId: workspace,
          containerId: containers.security,
          userId: users.bob,
          mode: GrantMode.allow,
        },
        {
          id: id(41),
          workspaceId: workspace,
          containerId: containers.product,
          userId: users.carol,
          mode: GrantMode.allow,
        },
        {
          id: id(42),
          workspaceId: workspace,
          containerId: containers.delivery,
          userId: users.carol,
          mode: GrantMode.deny,
        },
      ],
    });
    const defaultSet = await tx.statusSet.create({
      data: { id: id(50), workspaceId: workspace },
    });
    const engineeringSet = await tx.statusSet.create({
      data: {
        id: id(51),
        workspaceId: workspace,
        ownerContainerId: containers.engineering,
      },
    });
    const deliverySet = await tx.statusSet.create({
      data: {
        id: id(52),
        workspaceId: workspace,
        ownerContainerId: containers.delivery,
      },
    });
    const statuses = async (
      set: string,
      names: Array<[string, string, StatusCategory]>,
    ) =>
      tx.status.createMany({
        data: names.map(([key, name, category], index) => ({
          id: id(60 + Number(set.slice(-1)) * 10 + index),
          statusSetId: set,
          key,
          name,
          category,
          color: "#1677ff",
          position: index + 1,
        })),
      });
    await statuses(defaultSet.id, [
      ["todo", "Todo", StatusCategory.not_started],
      ["in_progress", "In Progress", StatusCategory.active],
      ["done", "Done", StatusCategory.done],
    ]);
    await statuses(engineeringSet.id, [
      ["todo", "Todo", StatusCategory.not_started],
      ["in_progress", "In Progress", StatusCategory.active],
      ["done", "Done", StatusCategory.done],
    ]);
    await statuses(deliverySet.id, [
      ["todo", "Todo", StatusCategory.not_started],
      ["building", "Building", StatusCategory.active],
      ["review", "Review", StatusCategory.active],
      ["done", "Done", StatusCategory.done],
    ]);
    const field = async (
      n: number,
      ownerContainerId: string,
      key: string,
      name: string,
      type: FieldType,
      required = false,
    ) =>
      tx.customFieldDefinition.create({
        data: {
          id: id(200 + n),
          workspaceId: workspace,
          ownerContainerId,
          key,
          name,
          type,
          required,
          position: n,
        },
      });
    const effort = await field(
      1,
      containers.engineering,
      "effort",
      "Effort",
      FieldType.number,
      true,
    );
    const workType = await field(
      2,
      containers.engineering,
      "work_type",
      "Work type",
      FieldType.single_select,
      true,
    );
    const tags = await field(
      3,
      containers.q2,
      "tags",
      "Tags",
      FieldType.multi_select,
    );
    const targetDate = await field(
      4,
      containers.q2,
      "target_date",
      "Target date",
      FieldType.date,
    );
    const customerNote = await field(
      5,
      containers.backlog,
      "customer_note",
      "Customer note",
      FieldType.text,
    );
    const verified = await field(
      6,
      containers.delivery,
      "verified",
      "Verified",
      FieldType.checkbox,
    );
    const impact = await field(
      7,
      containers.product,
      "impact",
      "Impact",
      FieldType.single_select,
      true,
    );
    await field(
      8,
      containers.strategy,
      "confidence",
      "Confidence",
      FieldType.number,
    );
    await tx.customFieldOption.createMany({
      data: [
        {
          id: id(301),
          fieldDefinitionId: workType.id,
          label: "Bug",
          color: "#ff4d4f",
          position: 1,
        },
        {
          id: id(302),
          fieldDefinitionId: workType.id,
          label: "Feature",
          color: "#1677ff",
          position: 2,
        },
        {
          id: id(303),
          fieldDefinitionId: tags.id,
          label: "Customer reported",
          color: "#722ed1",
          position: 1,
        },
        {
          id: id(304),
          fieldDefinitionId: tags.id,
          label: "Urgent",
          color: "#fa8c16",
          position: 2,
        },
        {
          id: id(305),
          fieldDefinitionId: impact.id,
          label: "High",
          color: "#ff4d4f",
          position: 1,
        },
      ],
    });
    const taskLists = [
      containers.backlog,
      containers.delivery,
      containers.security,
      containers.roadmap,
    ];
    for (let index = 0; index < 24; index++) {
      const list = taskLists[Math.floor(index / 6)];
      const statusKey =
        list === containers.delivery
          ? ["todo", "building", "review", "done"][index % 4]
          : ["todo", "in_progress", "done"][index % 3];
      const task = await tx.task.create({
        data: {
          id: id(400 + index),
          workspaceId: workspace,
          primaryListId: list,
          createdByUserId: index % 2 ? users.bob : users.alice,
          title: `Seed task ${index + 1}`,
          statusKey,
          priority: [
            Priority.urgent,
            Priority.high,
            Priority.normal,
            Priority.low,
            Priority.none,
          ][index % 5],
          position: (index % 6) + 1,
          dueDate: index % 2 ? new Date(Date.UTC(2026, 9, index + 1)) : null,
        },
      });
      await tx.taskAssignee.create({
        data: {
          taskId: task.id,
          userId: index % 2 ? users.bob : users.carol,
          workspaceId: workspace,
        },
      });
      if (
        list === containers.backlog ||
        list === containers.delivery ||
        list === containers.security
      ) {
        await tx.taskFieldValue.createMany({
          data: [
            {
              taskId: task.id,
              fieldDefinitionId: effort.id,
              workspaceId: workspace,
              value: index % 4,
            },
            {
              taskId: task.id,
              fieldDefinitionId: workType.id,
              workspaceId: workspace,
              value: id(index % 2 ? 302 : 301),
            },
            {
              taskId: task.id,
              fieldDefinitionId: tags.id,
              workspaceId: workspace,
              value: [id(303)],
            },
            {
              taskId: task.id,
              fieldDefinitionId: targetDate.id,
              workspaceId: workspace,
              value: `2026-10-${String((index % 20) + 1).padStart(2, "0")}`,
            },
          ],
        });
        if (list === containers.backlog)
          await tx.taskFieldValue.create({
            data: {
              taskId: task.id,
              fieldDefinitionId: customerNote.id,
              workspaceId: workspace,
              value: `Customer note ${index + 1}`,
            },
          });
        if (list === containers.delivery)
          await tx.taskFieldValue.create({
            data: {
              taskId: task.id,
              fieldDefinitionId: verified.id,
              workspaceId: workspace,
              value: index % 2 === 0,
            },
          });
      } else
        await tx.taskFieldValue.create({
          data: {
            taskId: task.id,
            fieldDefinitionId: impact.id,
            workspaceId: workspace,
            value: id(305),
          },
        });
    }
    await tx.$executeRawUnsafe(
      "INSERT INTO seed_markers (version) VALUES ('day-1-v1')",
    );
  });
}
main().finally(() => prisma.$disconnect());
