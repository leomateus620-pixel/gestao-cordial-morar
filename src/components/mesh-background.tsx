export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #f5f1eb 0%, #fbf8f4 48%, #efe7dc 100%)",
        }}
      />
      <div
        className="animate-mesh absolute -top-[15%] -left-[10%] hidden h-[70%] w-[80%] rounded-full blur-[130px] md:block"
        style={{ background: "rgba(95, 175, 199, 0.32)" }}
      />
      <div
        className="animate-mesh absolute -top-[5%] -right-[10%] hidden h-[60%] w-[70%] rounded-full blur-[120px] md:block"
        style={{ background: "rgba(217, 120, 45, 0.22)", animationDelay: "-7s" }}
      />
      <div
        className="animate-mesh absolute top-[45%] left-[35%] hidden h-[45%] w-[55%] rounded-full blur-[110px] md:block"
        style={{ background: "rgba(240, 168, 109, 0.18)", animationDelay: "-12s" }}
      />
    </div>
  );
}