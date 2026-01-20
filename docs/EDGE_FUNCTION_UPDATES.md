# Edge Function Updates Required for Report Card Viewer

## Summary
Add `return_html` parameter to report card Edge Functions to allow the web viewer
to display the full HTML report without sending an email.

## Changes Required

### 1. csa-report-card/index.ts

**Add to request body parsing (around line 560):**
```typescript
const { 
  user_id, 
  start_date, 
  end_date, 
  report_type = 'preview',
  send_email = true,
  test_email_override = null,
  jlu_complete = true,
  good_standing = true,
  return_html = false  // NEW: Return HTML in response for web viewer
} = await req.json()
```

**Modify the return response (around line 760):**
```typescript
return new Response(
  JSON.stringify({
    success: true,
    report_id: reportId,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    employee_email: employee.email,
    store_number: employee.store_number,
    store_name: employee.store_name,
    period: { start_date, end_date },
    report_type: report_type,
    total_bonus: bonus.summary.total_bonus,
    is_qualified: qualification.is_qualified,
    email_sent: emailSent,
    email_recipient: recipientEmail,
    is_test: isTestMode,
    ai_summary: aiSummary || null,
    html: return_html ? pdfHtml : undefined  // NEW: Include HTML if requested
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

### 2. greeter-report-card/index.ts

**Same changes as above - add `return_html` parameter and include HTML in response.**

### 3. manager-report-card/index.ts

**Same changes as above - add `return_html` parameter and include HTML in response.**

---

## Quick Deploy Commands

After making changes, deploy each function:

```bash
supabase functions deploy csa-report-card
supabase functions deploy greeter-report-card
supabase functions deploy manager-report-card
```

---

## Testing

After deployment, test with curl:

```bash
curl -X POST 'https://vzsitlasfekjkvsaukmh.supabase.co/functions/v1/csa-report-card' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{
    "user_id": 1000225003,
    "start_date": "2026-01-01",
    "end_date": "2026-01-19",
    "report_type": "preview",
    "send_email": false,
    "return_html": true
  }'
```

Response should include `"html": "<html>..."` field.
