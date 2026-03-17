import { AGE_BAND_OPTIONS, formatPlayLabel, PLAY_CATEGORY_OPTIONS, RESTART_TYPE_OPTIONS, SYSTEM_OPTIONS } from "../../lib/playMetadata";
import type { AgeBand, PlayCategory, RestartType, SystemType } from "../../types/domain";

export interface LibraryFilters {
  search: string;
  category: "" | PlayCategory;
  restartType: "" | RestartType;
  system: "" | SystemType;
  ageBand: "" | AgeBand;
}

interface LibraryFiltersBarProps {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
}

export function LibraryFiltersBar({ filters, onChange }: LibraryFiltersBarProps) {
  return (
    <div className="library-filters">
      <label className="panel-field library-filters__search">
        <span>Search</span>
        <input
          type="text"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search by title, description, or tag"
        />
      </label>

      <label className="panel-field">
        <span>Category</span>
        <label className="select-shell">
          <span className="sr-only">Category</span>
          <select
            value={filters.category}
            onChange={(event) => onChange({ ...filters, category: event.target.value as "" | PlayCategory })}
          >
            <option value="">All categories</option>
            {PLAY_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatPlayLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </label>

      <label className="panel-field">
        <span>Restart</span>
        <label className="select-shell">
          <span className="sr-only">Restart type</span>
          <select
            value={filters.restartType}
            onChange={(event) => onChange({ ...filters, restartType: event.target.value as "" | RestartType })}
          >
            <option value="">All restarts</option>
            {RESTART_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatPlayLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </label>

      <label className="panel-field">
        <span>System</span>
        <label className="select-shell">
          <span className="sr-only">System</span>
          <select
            value={filters.system}
            onChange={(event) => onChange({ ...filters, system: event.target.value as "" | SystemType })}
          >
            <option value="">All systems</option>
            {SYSTEM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </label>

      <label className="panel-field">
        <span>Age Band</span>
        <label className="select-shell">
          <span className="sr-only">Age band</span>
          <select
            value={filters.ageBand}
            onChange={(event) => onChange({ ...filters, ageBand: event.target.value as "" | AgeBand })}
          >
            <option value="">All ages</option>
            {AGE_BAND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatPlayLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </label>
    </div>
  );
}
