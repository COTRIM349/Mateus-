export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#061320] px-3 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-[1200px]">{children}</div>
    </div>
  );
}
