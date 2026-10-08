import { notFound } from "next/navigation"

import { AuditClient } from "./AuditClient"

export default function Audit() {
  if (process.env.NODE_ENV === "production") notFound()
  return <AuditClient />
}
