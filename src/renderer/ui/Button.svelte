<!-- Button in the shadcn-svelte style (tailwind-variants), sized for a compact player. -->
<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,opacity,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        ghost: "text-foreground/90 hover:bg-white/12 hover:text-foreground",
        glass: "bg-glass text-foreground backdrop-saturate-150 hover:bg-glass-strong",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-transparent hover:bg-white/8",
      },
      size: {
        "icon-sm": "size-7 [&_svg]:size-3.5",
        icon: "size-8 [&_svg]:size-4",
        "icon-lg": "size-10 [&_svg]:size-5",
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-8 px-3 [&_svg]:size-4",
      },
      pressed: { true: "bg-primary/20 text-primary hover:bg-primary/25 hover:text-primary", false: "" },
    },
    defaultVariants: { variant: "ghost", size: "icon", pressed: false },
  });

  export type ButtonVariants = VariantProps<typeof buttonVariants>;
</script>

<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "./utils";

  let {
    variant,
    size,
    pressed,
    class: className,
    children,
    ...rest
  }: HTMLButtonAttributes & ButtonVariants = $props();
</script>

<button type="button" class={cn(buttonVariants({ variant, size, pressed }), className)} {...rest}>
  {@render children?.()}
</button>
