/** App name: "Desk" in white, "Llama" in two-tone blue gradient. */
export default function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-0 font-extrabold tracking-tight text-[15px] ${className}`}>
      <span className="text-dark-text">Desk</span>
      <span className="bg-gradient-to-r from-desk-blue to-desk-blueBright bg-clip-text text-transparent">
        Llama
      </span>
    </span>
  );
}
