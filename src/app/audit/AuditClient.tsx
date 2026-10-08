"use client"

import { AuditPage, type AuditData, type AuditScan } from "./AuditPage"
import data from "./audit.data.json"
import scan from "./audit.scan.json"
import { specimens } from "./specimens"

export function AuditClient() {
  return (
    <AuditPage
      scan={scan as unknown as AuditScan}
      specimens={specimens}
      data={data as AuditData}
    />
  )
}
