import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nothing here',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="stamp">404</span>
      <h1 className="display-lg mt-6">No page at this address</h1>
      <p className="serif-accent mt-3 text-2xl">
        Which, if you got here from a shared link, means the link expired or was rotated.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-punch">
          Get your own link
        </Link>
        <Link href="/algorithm" className="btn">
          See the algorithm
        </Link>
      </div>
    </div>
  );
}
