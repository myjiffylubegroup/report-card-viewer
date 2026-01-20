# Report Card Viewer

A management portal for viewing and generating employee bonus report cards for My Jiffy Lube franchise group.

## Features

- **View Report Cards**: View CSA, Greeter, and Manager bonus reports for any employee
- **On-Demand Generation**: Generate reports for custom date ranges
- **Send to Employee**: Email reports directly to employees
- **Secure Access**: Supabase authentication for authorized users only

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Supabase (Auth + Database)
- Deployed on Render

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/report-card-viewer.git
cd report-card-viewer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000

## Deployment (Render)

1. Push to GitHub
2. Create new Web Service on Render
3. Connect to GitHub repo
4. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy

## User Management

Users are managed in Supabase Auth. To add a new user:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User"
3. Enter email and password
4. User can now log in

## Report Types

| Type | Description | Schedule |
|------|-------------|----------|
| CSA Bonus | Customer Service Advisor performance | 2nd, 10th, 20th |
| Greeter Bonus | Greeter performance metrics | 2nd, 10th, 20th |
| Manager Bonus | Store manager performance | 1st, 10th, 20th |

## Database Functions Used

- `csa-report-card` - Generate CSA bonus report
- `greeter-report-card` - Generate Greeter bonus report  
- `manager-report-card` - Generate Manager bonus report
- `get_employees_by_role` - Fetch employees by role

## Support

Contact Sean Porcher for access or issues.
