import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CarSilhouette } from "../components/CarSilhouette";

/** A dead link still gets a way back: the ranking, or the buying guide. */
export function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found | CarScore";
  }, []);

  return (
    <section className="mx-auto flex max-w-[1240px] flex-col items-start gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center md:gap-14 md:py-24">
      <div className="max-w-[520px]">
        <p className="nums text-[14px] font-semibold text-faint">Error 404</p>
        <h1 className="display mt-3 text-[40px] text-text sm:text-[52px]">Nothing at this address</h1>
        <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-muted">
          The link may be old, or the listing may have sold and dropped off the board. The ranking has everything
          that is currently for sale.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Link to="/" className="btn btn-primary">
            Back to the ranking
          </Link>
          <Link to="/guide" className="btn text-muted hover:text-text">
            Read the buying guide
          </Link>
        </div>
      </div>
      <CarSilhouette className="w-full max-w-[420px] opacity-90" />
    </section>
  );
}
