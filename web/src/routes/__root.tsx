import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../index.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <ErrorBoundary>
      <div className="container">
        <header className="header">
          <div className="title-group">
            <h1>Shared Bill Splitter</h1>
            <p>Manage shared homes, transparently divide bills, and track settled shares.</p>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </ErrorBoundary>
  )
}
