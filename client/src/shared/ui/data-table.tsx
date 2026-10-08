import { type ReactNode } from "react";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

export type DataTableColumn<TRecord> = {
  readonly key: string;
  readonly header: ReactNode;
  readonly className?: string;
  readonly render: (record: TRecord) => ReactNode;
};

export type DataTableProps<TRecord> = {
  readonly columns: ReadonlyArray<DataTableColumn<TRecord>>;
  readonly records: ReadonlyArray<TRecord>;
  readonly getRowKey: (record: TRecord) => string | number;
  readonly empty?: ReactNode;
  readonly className?: string;
};

export function DataTable<TRecord>({
  columns,
  records,
  getRowKey,
  empty,
  className,
}: DataTableProps<TRecord>): ReactNode {
  if (records.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 shadow-soft overflow-hidden rounded-xl ring-1",
        className,
      )}
    >
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className="text-muted-foreground h-9 px-3 text-[11px] font-semibold tracking-wider uppercase"
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={getRowKey(record)} className="align-top">
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "px-3 py-2.5 text-[13px] whitespace-normal",
                    column.className,
                  )}
                >
                  {column.render(record)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
