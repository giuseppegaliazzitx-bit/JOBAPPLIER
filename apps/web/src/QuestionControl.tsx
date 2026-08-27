import type { FieldOption, FieldType } from "@autoapply/core";

export function QuestionControl(props: {
  labelRaw: string;
  type: FieldType;
  required: boolean;
  options?: FieldOption[];
  sectionHeading?: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const options = props.options ?? [];
  return (
    <div className="space-y-2">
      {props.sectionHeading ? (
        <h3 className="font-serif text-lg">{props.sectionHeading}</h3>
      ) : null}
      <p className="text-sm">
        {props.labelRaw}
        {props.required ? <span className="text-accent"> *</span> : null}
      </p>
      <ControlBody {...props} options={options} name={props.name} />
    </div>
  );
}

function ControlBody(props: {
  type: FieldType;
  options: FieldOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const cls = "mt-1 w-full rounded-md border border-rule bg-panel px-3 py-2";
  if (props.type === "textarea" || props.type === "custom") {
    return (
      <textarea className={cls} rows={4} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    );
  }
  if (props.type === "select" || props.type === "multiselect") {
    return (
      <select className={cls} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Select</option>
        {props.options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (props.type === "radio") {
    return (
      <div className="mt-2 space-y-1">
        {props.options.map((option) => (
          <label key={option.value || option.label} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={props.name ?? "option"}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (props.type === "checkbox" || props.type === "checkbox_group") {
    const selected = new Set(props.value.split(",").filter(Boolean));
    return (
      <div className="mt-2 space-y-1">
        {props.options.length > 0 ? (
          props.options.map((option) => (
            <label key={option.value || option.label} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(option.value)) {
                    next.delete(option.value);
                  } else {
                    next.add(option.value);
                  }
                  props.onChange([...next].join(","));
                }}
              />
              {option.label}
            </label>
          ))
        ) : (
          <input
            type="checkbox"
            className="mt-2"
            checked={props.value === "yes" || props.value === "true"}
            onChange={(e) => props.onChange(e.target.checked ? "yes" : "no")}
          />
        )}
      </div>
    );
  }
  if (props.type === "file") {
    return <input className="mt-1 block" type="file" disabled />;
  }
  const inputType =
    props.type === "email" || props.type === "tel" || props.type === "url" || props.type === "number" || props.type === "date"
      ? props.type
      : "text";
  return (
    <input className={cls} type={inputType} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  );
}
