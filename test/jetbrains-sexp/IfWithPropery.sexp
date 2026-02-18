(source_file [0, 0] - [7, 0]
  (line_comment [0, 0] - [0, 21])
  (property_declaration [2, 0] - [2, 39]
    (binding_pattern_kind [2, 0] - [2, 3])
    (variable_declaration [2, 4] - [2, 5]
      (simple_identifier [2, 4] - [2, 5]))
    (if_expression [2, 8] - [2, 39]
      condition: (integer_literal [2, 11] - [2, 12])
      consequence: (control_structure_body [2, 14] - [2, 27]
        (statements [2, 15] - [2, 26]
          (property_declaration [2, 15] - [2, 24]
            (binding_pattern_kind [2, 15] - [2, 18])
            (variable_declaration [2, 19] - [2, 20]
              (simple_identifier [2, 19] - [2, 20]))
            (simple_identifier [2, 23] - [2, 24]))
          (simple_identifier [2, 25] - [2, 26])))
      alternative: (control_structure_body [2, 33] - [2, 39]
        (statements [2, 34] - [2, 38]
          (null_literal [2, 34] - [2, 38])))))
  (property_declaration [3, 0] - [6, 13]
    (binding_pattern_kind [3, 0] - [3, 3])
    (variable_declaration [3, 4] - [3, 5]
      (simple_identifier [3, 4] - [3, 5]))
    (if_expression [3, 8] - [6, 13]
      condition: (integer_literal [3, 11] - [3, 12])
      consequence: (control_structure_body [3, 14] - [6, 1]
        (statements [4, 2] - [5, 3]
          (property_declaration [4, 2] - [4, 11]
            (binding_pattern_kind [4, 2] - [4, 5])
            (variable_declaration [4, 6] - [4, 7]
              (simple_identifier [4, 6] - [4, 7]))
            (simple_identifier [4, 10] - [4, 11]))
          (simple_identifier [5, 2] - [5, 3])))
      alternative: (control_structure_body [6, 7] - [6, 13]
        (statements [6, 8] - [6, 12]
          (null_literal [6, 8] - [6, 12]))))))
