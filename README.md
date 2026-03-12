# The Shed — Coworking Space

A modern booking platform for The Shed coworking space. Choose from 4 unique rooms and reserve your hourly slot instantly.

## Features

- **Real-time Booking:** Browse and book rooms with instant availability updates.
- **Room Variety:** Four distinct environments (Office, Cordia, Meeting, and Shared) designed for different needs.
- **Admin Dashboard:** Manage bookings, view statistics, and adjust room availability.
- **Modern UI:** Built with React, Tailwind CSS, and Framer Motion for a premium, responsive experience.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Framer Motion
- **Backend:** Node.js, Express, Better-SQLite3
- **Database:** SQLite

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd the-shed-coworking
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the environment:**
   Create a `.env` file in the root directory (or copy `.env.example`):
   ```bash
   PORT=3000
   ADMIN_PASSWORD=your-secure-password
   ```

4. **Initialize and Seed Database:**
   The database will automatically initialize and seed with room data on first run.

5. **Run the application:**
   ```bash
   npm run dev
   ```

6. **Access the application:**
   - Public Website: `http://localhost:3000`
   - Admin Panel: `http://localhost:3000/admin`

## Development

- `npm run dev` - Starts the development server with Hot Module Replacement.
- `npm run build` - Builds the application for production.
- `npm run start` - Runs the production server.
- `npm run clean` - Removes the `dist` build directory.

## License

MIT
