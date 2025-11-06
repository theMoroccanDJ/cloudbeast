import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme-corp",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: {
      email: "owner@example.com",
      name: "Owner",
    },
  });

  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId: organization.id,
      userId: user.id,
    },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
