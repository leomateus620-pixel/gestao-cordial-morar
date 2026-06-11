export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div className="animate-mesh absolute -top-[20%] -left-[10%] h-[70%] w-[100%] rounded-full bg-primary/15 blur-[120px]" />
      <div
        className="animate-mesh absolute -bottom-[10%] -right-[10%] h-[60%] w-[80%] rounded-full bg-orange-300/30 blur-[110px]"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="animate-mesh absolute top-[35%] left-[40%] h-[40%] w-[50%] rounded-full bg-amber-200/25 blur-[100px]"
        style={{ animationDelay: "-12s" }}
      />
    </div>
  );
}