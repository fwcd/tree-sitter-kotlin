fun foo(): Int {
    for (@ForParameter("p") (@NestedParam("p") y) in bar()) {}
}