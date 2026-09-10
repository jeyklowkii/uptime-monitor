import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="font-display text-2xl font-semibold">Page not found</div>
      <p className="mt-2 text-sm text-muted">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-5">
        <Button size="sm">Back to dashboard</Button>
      </Link>
    </div>
  );
}
