import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoPickerGrid } from "@/design-system/patterns/PhotoPickerGrid";

// RTL smoke render (nutrition-submodule fast-follow, 5th round, standard mode) — the real
// `<input type="file">` must stay in the DOM even once maxImages is reached, since FormData reads
// selected files off that element on submit (an earlier draft unmounted it, silently dropping
// already-picked files).
function makeImageFile(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

// jsdom has no DataTransfer constructor — build a minimal FileList-shaped array-like instead.
function fakeFileList(files: File[]): FileList {
  const list = files as unknown as FileList & File[];
  (list as unknown as { item: (i: number) => File }).item = (i: number) => files[i];
  return list;
}

describe("PhotoPickerGrid — smoke render (nutrition-submodule)", () => {
  afterEach(() => cleanup());

  it("renders a hidden file input plus the add tile showing 0/max", () => {
    render(<PhotoPickerGrid name="photos" maxImages={6} />);
    expect(screen.getByLabelText("Agregar fotos")).toBeInTheDocument();
    expect(screen.getByText("0/6")).toBeInTheDocument();
  });

  it("adding a photo shows a thumbnail and updates the counter", () => {
    render(<PhotoPickerGrid name="photos" maxImages={6} />);
    const input = screen.getByLabelText("Agregar fotos") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: fakeFileList([makeImageFile("a.jpg")]), configurable: true });
    fireEvent.change(input);

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });

  it("the file input stays mounted after reaching the max, so already-picked files are not lost", () => {
    render(<PhotoPickerGrid name="photos" maxImages={1} />);
    const input = screen.getByLabelText("Agregar fotos") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: fakeFileList([makeImageFile("a.jpg")]), configurable: true });
    fireEvent.change(input);

    // add tile disappears at the cap...
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
    // ...but the input itself (and its accumulated files) must still be in the DOM for FormData.
    expect(screen.getByLabelText("Agregar fotos")).toBeInTheDocument();
    expect(screen.getByLabelText("Agregar fotos")).toHaveAttribute("name", "photos");
  });

  it("removing a photo restores room to add more", () => {
    render(<PhotoPickerGrid name="photos" maxImages={1} />);
    const input = screen.getByLabelText("Agregar fotos") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: fakeFileList([makeImageFile("a.jpg")]), configurable: true });
    fireEvent.change(input);

    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("warns when more files are selected than room remains", () => {
    render(<PhotoPickerGrid name="photos" maxImages={1} />);
    const input = screen.getByLabelText("Agregar fotos") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: fakeFileList([makeImageFile("a.jpg"), makeImageFile("b.jpg")]),
      configurable: true,
    });
    fireEvent.change(input);

    expect(screen.getByText(/Solo se agregaron 1/)).toBeInTheDocument();
  });
});
