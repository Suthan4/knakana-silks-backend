$file = 'c:\Users\user\source\repos\kangana-silks-backend\prisma\schema.prisma'
$content = [System.IO.File]::ReadAllText($file)

# 1. Expand the DraftStatus enum
$oldEnum = @"
enum DraftStatus {
  DRAFT
  READY_FOR_IMPORT
  FAILED
  COMPLETED
}
"@
$newEnum = @"
enum DraftStatus {
  DRAFT
  VALIDATED
  MATCHING
  MATCHED
  IMPORTING
  IMPORTED
  READY_FOR_IMPORT
  FAILED
  COMPLETED
}
"@

if ($content.Contains("MATCHING")) {
    Write-Host "Enum already expanded, skipping enum update."
} elseif ($content.Contains("enum DraftStatus")) {
    Write-Host "Expanding DraftStatus enum..."
    $content = $content.Replace($oldEnum.Replace("`r`n", "`n"), $newEnum.Replace("`r`n", "`n"))
    $content = $content.Replace($oldEnum, $newEnum)
    Write-Host "Enum expanded."
} else {
    Write-Host "DraftStatus enum not found!"
}

# 2. Add confirmedAssignments field to BulkImportDraft if missing
if (-not $content.Contains("confirmedAssignments")) {
    Write-Host "Adding confirmedAssignments field..."
    $content = $content.Replace("  imageMatches Json?", "  imageMatches         Json?`n  confirmedAssignments Json?")
    Write-Host "Field added."
} else {
    Write-Host "confirmedAssignments already present."
}

# 3. Add @@map if missing
if (-not $content.Contains("bulk_import_drafts")) {
    Write-Host "Adding @@map for BulkImportDraft..."
    $content = $content.Replace("  @@index([userId])`n}", "  @@index([userId])`n  @@map(`"bulk_import_drafts`")`n}")
    Write-Host "@@map added."
} else {
    Write-Host "@@map already present."
}

[System.IO.File]::WriteAllText($file, $content)
Write-Host "Schema file written."

