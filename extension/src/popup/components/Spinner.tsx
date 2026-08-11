interface SpinnerProps {
  className?: string;
}

function Spinner({ className = "h-4 w-4" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export default Spinner;
