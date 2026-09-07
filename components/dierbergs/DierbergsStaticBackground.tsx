"use client";

type Props = {
  src: string;
};

export default function DierbergsStaticBackground({ src }: Props) {
  return (
    <img
      src={src}
      alt="Dierbergs Markets storefront"
      className="dierbergs-static-page"
      draggable={false}
    />
  );
}
