function SectionTitle({ label, action }: { label: string; action: string }) {
  return (
    <div className="section-title">
      <h2>{label}</h2>
      <button type="button">{action}</button>
    </div>
  );
}

export default SectionTitle;
